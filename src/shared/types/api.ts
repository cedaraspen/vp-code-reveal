export type InitResponse = {
  type: 'init';
  postId: string;
  username: string;
};

export type RetrieveCodeResponse = {
  status: 'Available' | 'Unavailable';
  code: string | null;
};
