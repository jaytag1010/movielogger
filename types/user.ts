import { Timestamp } from 'firebase/firestore'

export interface UserProfile {
  uid: string
  email: string | null
  displayName: string | null
  photoURL: string | null
  createdAt: Timestamp
  updatedAt: Timestamp
}

export interface UserStats {
  totalTitles: number
  totalMovies: number
  totalSeries: number
  totalWatchHours: number
  averageRating: number
  completedTitles: number
}
