const PETITION = "https://petition.parliament.uk/petitions/722903";

// Shown to UK visitors, who get no images (see lib/region.ts).
export function UkBanner() {
  return (
    <div role="note" className="border-b border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-sm">
      <p className="mx-auto max-w-6xl">
        🇬🇧 Images aren&apos;t shown to UK visitors because of the Online Safety Act. Over 550,000 people signed the{" "}
        <a href={PETITION} target="_blank" rel="noopener noreferrer" className="font-medium underline">
          petition to repeal it
        </a>
        . If you agree, consider supporting a party that has pledged to repeal it.
      </p>
    </div>
  );
}
