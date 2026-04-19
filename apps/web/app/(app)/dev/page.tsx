/**
 * /dev — AI Developer studio.
 *
 * Server wrapper. The actual editor/chat/run UI lives in `<DevStudio />`,
 * which must be a client component because it owns Monaco + local editor state.
 */
import { DevStudio } from "./dev-studio";

export const dynamic = "force-dynamic";

export default function DevPage() {
  return (
    <div className="flex h-[calc(100vh-56px)] flex-col">
      <DevStudio />
    </div>
  );
}
