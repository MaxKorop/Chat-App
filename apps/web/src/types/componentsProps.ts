import { InputRef } from 'antd';
import { RefObject } from 'react';

import { Message } from './types';

export interface MessageProps {
  message: Message;
  setHeightToScroll: Function;
}

export interface LogInComponentProps {
  userName: RefObject<InputRef | null>;
  password: RefObject<InputRef | null>;
  setIsLogin: (arg0: boolean) => void;
}

export interface SignUpComponentProps extends LogInComponentProps {
  email: RefObject<InputRef | null>;
}

export interface ChatContentProps {
  setHeightToScroll: Function;
}
