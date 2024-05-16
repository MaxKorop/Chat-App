import { Input, Space, Typography } from "antd";
import React from "react";
import { SignUpComponentProps } from "../../../types/componentsProps";

const { Title, Link } = Typography;

const SignUp: React.FC<SignUpComponentProps> = ({ userName, password, setIsLogin, email }) => {
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
                placeholder="Type your email here..."
                style={{
                    width: "100%"
                }}
                ref={email}
            />
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
            <Link onClick={() => setIsLogin(true)}>Sign Up</Link>
        </Space>
    )
};

export default SignUp;