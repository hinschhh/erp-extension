import { Spin } from "antd";
import { LoadingOutlined } from "@ant-design/icons";
import Image from "next/image";

export function LoadingFallback() {
    return (
        <div
            style={{
                height: "100vh",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 24,
            }}
        >
            <Image
                src="/L&L_Logo_1200_x_200.jpg"
                alt="Land & Liebe"
                width={300}
                height={70}
                priority
            />
            <Spin
                size="large"
                indicator={<LoadingOutlined style={{ color: "black" }} spin />}
            />
        </div>
    );
}
