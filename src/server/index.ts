import express from 'express';
import { Request } from 'express';
import { InitResponse } from '../shared/types/api';
import { redis, reddit, createServer, context, getServerPort, realtime } from '@devvit/web/server';
import { createPost } from './core/post';
import { OnCommentCreateRequest, TriggerResponse } from '@devvit/web/shared';

const app = express();

// Middleware for JSON body parsing
app.use(express.json());
// Middleware for URL-encoded body parsing
app.use(express.urlencoded({ extended: true }));
// Middleware for plain text body parsing
app.use(express.text());

const router = express.Router();

router.get<{ postId: string }, InitResponse | { status: string; message: string }>(
  '/api/init',
  async (_req, res): Promise<void> => {
    const { postId } = context;

    if (!postId) {
      console.error('API Init Error: postId not found in devvit context');
      res.status(400).json({
        status: 'error',
        message: 'postId is required but missing from context',
      });
      return;
    }

    try {
      const username = await reddit.getCurrentUsername();

      res.json({
        type: 'init',
        postId: postId,
        username: username ?? 'anonymous',
      });
    } catch (error) {
      console.error(`API Init Error for post ${postId}:`, error);
      let errorMessage = 'Unknown error during initialization';
      if (error instanceof Error) {
        errorMessage = `Initialization failed: ${error.message}`;
      }
      res.status(400).json({ status: 'error', message: errorMessage });
    }
  }
);

router.post('/internal/on-app-install', async (_req, res): Promise<void> => {
  try {
    const post = await createPost();

    res.json({
      status: 'success',
      message: `Post created in subreddit ${context.subredditName} with id ${post.id}`,
    });
  } catch (error) {
    console.error(`Error creating post: ${error}`);
    res.status(400).json({
      status: 'error',
      message: 'Failed to create post',
    });
  }
});

router.post('/internal/menu/post-create', async (_req, res): Promise<void> => {
  try {
    const post = await createPost();

    res.json({
      navigateTo: `https://reddit.com/r/${context.subredditName}/comments/${post.id}`,
    });
  } catch (error) {
    console.error(`Error creating post: ${error}`);
    res.status(400).json({
      status: 'error',
      message: 'Failed to create post',
    });
  }
});

router.post(
  '/internal/on-comment-create',
  async (req: Request<OnCommentCreateRequest>, _res: TriggerResponse): Promise<void> => {
    const commentText = req.body.comment?.body;
    console.log('Comment text received', commentText);

    if (!commentText) {
      return;
    }

    const isMedicCommand = commentText.match(/!medic/i);

    if (!isMedicCommand) {
      return;
    }

    console.log('Generating medic code for user', req.body.comment?.author);

    // Generate 8 letter code
    const generateCode = (): string => {
      const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
      let code = '';
      for (let i = 0; i < 8; i++) {
        code += letters.charAt(Math.floor(Math.random() * letters.length));
      }
      return code;
    };

    const userId = req.body.author?.id;

    if (!userId) {
      console.error('No userId found in comment');
      return;
    }

    const generatedCode = generateCode();

    try {
      const user = await reddit.getUserById(userId);
      const username = user?.username;
      if (!username) {
        console.error('No username found for user', userId);
        return;
      }

      let code = await redis.get(`code:${userId}`);
      if (!code) {
        await redis.set(`code:${userId}`, generatedCode);
        code = generatedCode;
      }

      console.log(`Generated and stored code for user ${userId}: ${code}`);
      await realtime.send(`code_${userId}`, { status: 'AVAILABLE' });
      await reddit.sendPrivateMessage({
        to: username,
        subject: 'Your code is ready!',
        text: `Your medic code is ${code}`,
      });
    } catch (error) {
      console.error(`Error storing code for user ${userId}:`, error);
    }
  }
);

router.get('/api/retrieve-code', async (_req, res): Promise<void> => {
  try {
    const { userId } = context;

    if (!userId) {
      res.status(401).json({
        status: 'error',
        message: 'User not authenticated',
      });
      return;
    }

    const code = await redis.get(`code:${userId}`);

    if (!code) {
      res.json({
        status: 'Unavailable',
        code: null,
      });
      return;
    }

    res.json({
      status: 'Available',
      code: code,
    });
  } catch (error) {
    console.error(`Error retrieving code: ${error}`);
    res.status(500).json({
      status: 'error',
      message: 'Failed to retrieve code',
    });
  }
});

router.post('/api/delete-code', async (_req, res): Promise<void> => {
  try {
    const { userId } = context;

    if (!userId) {
      res.status(401).json({
        status: 'error',
        message: 'User not authenticated',
      });
      return;
    }

    await redis.del(`code:${userId}`);

    res.json({
      status: 'success',
      message: 'Code deleted successfully',
    });
  } catch (error) {
    console.error(`Error deleting code: ${error}`);
    res.status(500).json({
      status: 'error',
      message: 'Failed to delete code',
    });
  }
});

// Use router middleware
app.use(router);

// Get port from environment variable with fallback
const port = getServerPort();

const server = createServer(app);
server.on('error', (err) => console.error(`server error; ${err.stack}`));
server.listen(port);
