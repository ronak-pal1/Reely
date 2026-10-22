import { PreviewStage } from "@/components/PreviewStage";
import { ThemeToggle } from "@/components/ThemeToggle";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-10 px-6 py-8">
      <header className="flex items-center justify-between">
        <div className="text-sm font-semibold tracking-[0.22em]">REELIO</div>
        <ThemeToggle />
      </header>
      <section className="grid items-center gap-10 md:grid-cols-[1.1fr_0.9fr]">
        <div>
          <p className="text-sm text-accent">Timeline schema · Remotion</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight md:text-6xl">
            One JSON timeline. Preview and export.
          </h1>
          <p className="mt-4 max-w-xl text-base leading-7 text-mute">
            REELIO edits a versioned timeline document. This player renders that document with the
            same composition the exporter will use.
          </p>
        </div>
        <PreviewStage />
      </section>
    </main>
  );
}
