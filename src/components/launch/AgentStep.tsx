import { Link } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { Panel } from "@/components/Panel";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/** A saved Raya agent as listed for the program. */
export interface AgentOption {
  id: string;
  agent_id: string;
  name: string;
}

interface AgentStepProps {
  program: string;
  agents: AgentOption[] | undefined;
  isLoading: boolean;
  error: Error | null;
  agentId: string;
  onSelect: (agentId: string) => void;
}

/** Step 2: choose the saved Raya agent that places the calls. */
export function AgentStep({
  program,
  agents,
  isLoading,
  error,
  agentId,
  onSelect,
}: AgentStepProps) {
  return (
    <Panel
      title="Step 2 · Agent"
      description={`Choose which saved ${program.toUpperCase()} agent will place the calls`}
    >
      {isLoading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading agents…
        </div>
      )}
      {error && (
        <div className="rounded-md bg-red-500/15 px-3 py-2 text-sm text-red-700 dark:text-red-400">
          {error.message}
        </div>
      )}
      {agents && agents.length === 0 && (
        <div className="rounded-md border border-dashed px-4 py-6 text-sm text-muted-foreground">
          No agents saved for {program.toUpperCase()}.{" "}
          <Link to="/settings" className="text-brand underline">
            Add one in the Agents section
          </Link>
          .
        </div>
      )}
      {agents && agents.length > 0 && (
        <div className="space-y-2 max-w-xl">
          <Label>Raya agent</Label>
          <Select value={agentId} onValueChange={onSelect}>
            <SelectTrigger>
              <SelectValue placeholder="Select an agent" />
            </SelectTrigger>
            <SelectContent>
              {agents.map((a) => (
                <SelectItem key={a.id} value={a.agent_id}>
                  <div className="flex flex-col">
                    <span>
                      {a.name} —{" "}
                      <span className="font-mono text-[10px] opacity-60">{a.agent_id}</span>
                    </span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Manage agents in the{" "}
            <Link to="/settings" className="text-brand underline">
              Agents
            </Link>{" "}
            section.
          </p>
        </div>
      )}
    </Panel>
  );
}
