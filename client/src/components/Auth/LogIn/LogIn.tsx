import { Input, Space, Typography } from "antd";
import React, { ChangeEvent } from "react";
import { LogInComponentProps } from "../../../types/componentsProps";

const { Title, Link } = Typography;

const LogIn: React.FC<LogInComponentProps> = ({ userName, password, setIsLogin }) => {
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
                style={{
                    width: "100%"
                }}
                ref={userName}
            />
            <Input.Password
                placeholder="Type your password here..."
                visibilityToggle={true}
                style={{
                    width: "100%"
                }}
                ref={password}
            />
            <Link onClick={() => setIsLogin(false)}>Sign Up</Link>
        </Space>
    )
};

export default LogIn;