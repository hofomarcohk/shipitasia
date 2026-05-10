export type PdaUser = {
  username: string;
  firstName: string;
  lastName: string;
  email: string;
  profilePic: string;
  warehouseCode: string;
};

export type PdaMessage = {
  show: boolean;
  content?: {
    icon: React.ReactNode;
    title: string;
    message?: string;
    callback?: () => void;
    button?: string;
  };
};
