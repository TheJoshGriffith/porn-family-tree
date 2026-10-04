/* eslint-disable @next/next/no-img-element -- remote StashDB images, no optimiser needed */

export function Avatar({ src, name, className = "" }: { src: string | null; name: string; className?: string }) {
  return (
    <div className={`overflow-hidden bg-surface-2 ${className}`}>
      {src ? (
        <img src={src} alt={name} loading="lazy" referrerPolicy="no-referrer" className="nsfw h-full w-full object-cover object-top" />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-2xl text-muted">{name.slice(0, 1)}</div>
      )}
    </div>
  );
}
