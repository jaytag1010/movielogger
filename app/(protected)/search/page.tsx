import { FullSearchPage } from '@/components/search/FullSearchPage'

export default function SearchPage({ searchParams }: { searchParams?: { q?: string } }) {
  return <FullSearchPage initialQuery={searchParams?.q ?? ''} />
}
