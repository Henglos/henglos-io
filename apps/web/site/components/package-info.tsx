import { Package } from 'lucide-react';

type PackageInfoProps = {
  /** The npm package — what to type in the studio's store. */
  name: string;
  /** The version these docs describe. */
  version: string;
  /** The platform versions it runs on (its manifest's dependences.platform). */
  platform?: string;
  /** What it needs of the board (dependences.capabilities). */
  needs?: string[];
};

/** A built-in package's card at the top of its page: its name, version, and what it runs on. */
export function PackageInfo({ name, version, platform, needs }: PackageInfoProps) {
  return (
    <div className="not-prose my-6 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-fd-border bg-fd-card px-4 py-3 text-sm">
      <span className="flex items-center gap-2 font-mono text-fd-foreground">
        <Package className="size-4 text-fd-primary" />
        {name}
      </span>
      <span className="text-fd-muted-foreground">v{version}</span>
      {platform && <span className="text-fd-muted-foreground">platform {platform}</span>}
      {needs && needs.length > 0 && (
        <span className="flex items-center gap-1.5 text-fd-muted-foreground">
          needs
          {needs.map((need) => (
            <code key={need} className="rounded bg-fd-muted px-1.5 py-0.5 text-xs text-fd-foreground">{need}</code>
          ))}
        </span>
      )}
    </div>
  );
}
