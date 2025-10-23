import { Tag } from "antd";
import {
  ClockCircleOutlined,
  ShoppingCartOutlined,
  CheckCircleOutlined,
  ToolOutlined,
  CarOutlined,
  PauseCircleOutlined,
  StopOutlined,
  DeliveredProcedureOutlined,
  ExclamationCircleOutlined,
} from "@ant-design/icons";

const statusMap: Record<
  string,
  { color: string; label: string; icon: React.ReactNode }
> = {
  draft: {
    color: "default",
    label: "Entwurf",
    icon: <ClockCircleOutlined />,
  },
  ordered: {
    color: "blue",
    label: "Bestellt",
    icon: <ShoppingCartOutlined />,
  },
  confirmed: {
    color: "cyan",
    label: "Bestätigt",
    icon: <CheckCircleOutlined />,
  },
  partially_in_production:{
    color: "magenta",
    label: "Teilweise in Produktion",
    icon: <ExclamationCircleOutlined />,
  },
  in_production: {
    color: "orange",
    label: "In Produktion",
    icon: <ToolOutlined />,
  },
  delivered: {
    color: "green",
    label: "Geliefert",
    icon: <CarOutlined />,
  },
  paused: {
    color: "gold",
    label: "Pausiert",
    icon: <PauseCircleOutlined />,
  },
  cancelled: {
    color: "red",
    label: "Storniert",
    icon: <StopOutlined />,
  },
  partially_delivered: {
    color: "purple",
    label: "Teilgeliefert",
    icon: <DeliveredProcedureOutlined />,
  },
};

export function PoStatusTag({ status }: { status: string }) {
  const statusInfo = statusMap[status];
  return (
    <Tag color={statusInfo.color} icon={statusInfo.icon}>
      {statusInfo.label}
    </Tag>
  );
}