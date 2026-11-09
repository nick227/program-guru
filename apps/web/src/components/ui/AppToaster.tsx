import { useEffect, useState } from 'react'
import { Toaster } from 'sonner'

// Phones keep their primary actions in a bottom bar (Publish, Finish, Confirm), so toasts
// appear at the top there, just below the 64px app header. Larger screens keep bottom-right.
const PHONE = '(max-width: 639.98px)'
const BELOW_HEADER = 'calc(env(safe-area-inset-top, 0px) + 4.5rem)'
// Sonner leaves any side missing from an offset object undefined, which unpins the toaster and
// widens the page; every side is given, using Sonner's own defaults (32px, 16px on phones).
const OFFSET = { top: BELOW_HEADER, right: '32px', bottom: '32px', left: '32px' }
const MOBILE_OFFSET = { top: BELOW_HEADER, right: '16px', bottom: '16px', left: '16px' }

function usePhone() {
  const [phone, setPhone] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(PHONE).matches,
  )
  useEffect(() => {
    const query = window.matchMedia(PHONE)
    const update = () => setPhone(query.matches)
    update()
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])
  return phone
}

export function AppToaster() {
  const phone = usePhone()
  return (
    <Toaster
      position={phone ? 'top-center' : 'bottom-right'}
      offset={OFFSET}
      mobileOffset={MOBILE_OFFSET}
    />
  )
}
