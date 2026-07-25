import LiveConsole from "@/components/live-console";

export const metadata = {
  title: "Live — Handoff",
  description:
    "Paste a request and watch the real pipeline classify, gate, branch and execute it.",
};

export default function LivePage() {
  return (
    <main className="page-enter">
      <LiveConsole />
    </main>
  );
}
