import { CatalogueTabs } from './catalogue-tabs';

export default function CatalogueLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-6">
      <CatalogueTabs />
      {children}
    </div>
  );
}
