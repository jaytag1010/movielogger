import { PublicProfileView } from '@/components/public/PublicProfileView'

export default function PublicProfilePage({ params }: { params: { username: string } }) {
  return <PublicProfileView username={params.username} />
}
