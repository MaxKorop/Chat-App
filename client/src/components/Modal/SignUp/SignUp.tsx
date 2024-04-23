import { Input, Space, Typography } from "antd";
import React, { ChangeEvent } from "react";
import { SignUpComponentProps } from "../../../types/componentsProps";

const { Title, Link } = Typography;

const SignUp: React.FC<SignUpComponentProps> = ({ userName, setUserName, password, setPassword, setIsLogin, email, setEmail }) => {
    return (
        <Space
            direction="vertical"
            size='small'
            style={{
                display: 'flex'
            }}
        >
            <Title level={4} >Sign Up</Title>
            <Input
                placeholder="Type your name here..."
                value={userName}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setUserName(e.target.value)}
                style={{
                    width: "100%"
                }}
            />
            <Input
                placeholder="Type your email here..."
                value={email}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
                style={{
                    width: "100%"
                }}
            />
            <Input
                placeholder="Type your password here..."
                type="password"
                value={password}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
                style={{
                    width: "100%"
                }}
            />
            <Link onClick={() => setIsLogin(true)}>Sign Up</Link>
        </Space>
    )
};

export default SignUp;