import { Input, Space, Typography } from "antd";
import React, { ChangeEvent } from "react";
import { LogInComponentProps } from "../../../types/componentsProps";

const { Title, Link } = Typography;

const LogIn: React.FC<LogInComponentProps> = ({ userName, setUserName, password, setPassword, setIsLogin }) => {
    return (
        <Space
            direction="vertical"
            size='small'
            style={{
                display: 'flex'
            }}
        >
            <Title level={4} >Log In</Title>
            <Input
                placeholder="Type your name here..."
                value={userName}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setUserName(e.target.value)}
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
            <Link onClick={() => setIsLogin(false)}>Sign Up</Link>
        </Space>
    )
};

export default LogIn;