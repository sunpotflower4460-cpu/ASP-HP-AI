import pages from '../../data/pages.json';

export type PageMeta = {
  id: string;
  path: string;
  name: string;
  editable: boolean;
  lastReviewedAt?: string;
};

export function getPageById(id: string): PageMeta | undefined {
  return (pages as PageMeta[]).find((page) => page.id === id);
}

export function getPageByPath(path: string): PageMeta | undefined {
  const normalized = path === '/' ? '/' : `${path.replace(/\/+$/, '')}/`;
  return (pages as PageMeta[]).find((page) => page.path === normalized);
}

export function getPages(): PageMeta[] {
  return [...(pages as PageMeta[])];
}
