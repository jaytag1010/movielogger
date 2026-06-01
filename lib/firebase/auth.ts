import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  GoogleAuthProvider,
  signInWithPopup,
  updateProfile,
  onAuthStateChanged,
  User,
  getAuth,
} from 'firebase/auth'
import { doc, setDoc, getDoc, serverTimestamp, getFirestore } from 'firebase/firestore'
import { initApp } from './config'

const googleProvider = new GoogleAuthProvider()

function auth() {
  return getAuth(initApp())
}

function db() {
  return getFirestore(initApp())
}

export async function signUpWithEmail(
  email: string,
  password: string,
  displayName: string
): Promise<User> {
  const credential = await createUserWithEmailAndPassword(auth(), email, password)
  await updateProfile(credential.user, { displayName })
  // Non-blocking: profile write failure must not kill a successful sign-up
  createUserProfile(credential.user).catch((err) => {
    console.error('[createUserProfile] Failed after signUpWithEmail:', err)
  })
  return credential.user
}

export async function signInWithEmail(email: string, password: string): Promise<User> {
  const credential = await signInWithEmailAndPassword(auth(), email, password)
  return credential.user
}

export async function signInWithGoogle(): Promise<User> {
  const credential = await signInWithPopup(auth(), googleProvider)
  // Non-blocking: profile creation must not block or break a successful auth.
  // If Firestore rules aren't deployed yet, the user still reaches the dashboard.
  createUserProfile(credential.user).catch((err) => {
    console.error('[createUserProfile] Failed after signInWithGoogle:', err)
  })
  return credential.user
}

export async function logOut(): Promise<void> {
  await signOut(auth())
}

export async function resetPassword(email: string): Promise<void> {
  await sendPasswordResetEmail(auth(), email)
}

async function createUserProfile(user: User): Promise<void> {
  const firestore = db()
  const userRef = doc(firestore, 'users', user.uid)
  const userSnap = await getDoc(userRef)

  if (!userSnap.exists()) {
    await setDoc(userRef, {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
      photoURL: user.photoURL,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  }
}

export function onAuthChange(callback: (user: User | null) => void) {
  return onAuthStateChanged(auth(), callback)
}
