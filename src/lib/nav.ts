import { router } from 'expo-router';

// Closes a modal, or goes home when it was opened directly (e.g. after a reload).
export function closeModal() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}
