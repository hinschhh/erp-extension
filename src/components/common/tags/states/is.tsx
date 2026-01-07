import { Tag } from "antd";
import {
  ClockCircleOutlined,
  BarcodeOutlined,
  LoginOutlined,
} from "@ant-design/icons";

export const statusMap: Record<
  string,
  { color: string; label: string; icon: React.ReactNode }
> = {
  planned: {
    color: "blue",
    label: "Angekündigt",
    icon: <ClockCircleOutlined />,
  },
  delivered: {
    color: "cyan",
    label: "Erfasst",
    icon: <BarcodeOutlined />,
  },
  posted: {
    color: "green",
    label: "Gebucht",
    icon: <LoginOutlined />,
  },
};

export function ISStatusTag({ status }: { status: string }) {
  const statusInfo = statusMap[status];
  return (
    <Tag color={statusInfo.color ?? "default"} icon={statusInfo.icon ?? null}>
      {statusInfo.label}
    </Tag>
  );
}