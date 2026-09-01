import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { REGION_TREE } from "@/lib/ecosystem-config";

export interface RegionValue {
  state: string;
  district: string;
}

export function RegionSelector({
  value,
  onChange,
}: {
  value: RegionValue;
  onChange: (v: RegionValue) => void;
}) {
  const stateEntry = REGION_TREE.find((s) => s.state === value.state) ?? REGION_TREE[0];
  return (
    <div className="flex items-center gap-2">
      <Select
        value={value.state}
        onValueChange={(s) => {
          const entry = REGION_TREE.find((r) => r.state === s);
          onChange({ state: s, district: entry?.districts[0] ?? "" });
        }}
      >
        <SelectTrigger className="h-8 w-[120px] text-xs">
          <SelectValue placeholder="State" />
        </SelectTrigger>
        <SelectContent>
          {REGION_TREE.map((s) => (
            <SelectItem key={s.state} value={s.state}>
              {s.state}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={value.district} onValueChange={(d) => onChange({ ...value, district: d })}>
        <SelectTrigger className="h-8 w-[180px] text-xs">
          <SelectValue placeholder="District" />
        </SelectTrigger>
        <SelectContent>
          {stateEntry.districts.map((d) => (
            <SelectItem key={d} value={d}>
              {d}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
