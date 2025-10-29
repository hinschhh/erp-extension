import { Select } from "antd";
import { useSelect } from "@refinedev/antd";
import { Tables } from "@/types/supabase";

type Supplier = Tables<"app_suppliers">;

export default function SelectSupplier (props: any) {
    const { selectProps } = useSelect<Supplier>({
        resource: "app_suppliers",
        optionLabel: "id",
        optionValue: "id",
    });

    return (
        <Select {...selectProps} {...props} />
    );
}