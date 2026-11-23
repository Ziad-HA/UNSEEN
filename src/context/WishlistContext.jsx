import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

const WishlistContext = createContext(null)
const STORAGE_KEY = 'Nobi-wishlist'

function readWishlist() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
    return Array.isArray(value) ? [...new Set(value.filter((id) => typeof id === 'string'))] : []
  } catch { return [] }
}

export function WishlistProvider({ children }) {
  const [ids, setIds] = useState(readWishlist)
  const [userId, setUserId] = useState(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!supabase) { setReady(true); return undefined }
    let active = true

    const restoreWishlist = async (session) => {
      const nextUserId = session?.user?.id || null
      setReady(false)
      setUserId(nextUserId)
      if (!nextUserId) { setReady(true); return }

      const { data, error } = await supabase
        .from('saved_wishlists')
        .select('product_ids')
        .eq('user_id', nextUserId)
        .maybeSingle()

      if (!active) return
      if (!error && Array.isArray(data?.product_ids)) {
        setIds((current) => [...new Set([...data.product_ids, ...current])])
      }
      setReady(true)
    }

    supabase.auth.getSession().then(({ data }) => restoreWishlist(data?.session ?? null))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      window.setTimeout(() => restoreWishlist(session), 0)
    })

    return () => { active = false; subscription.unsubscribe() }
  }, [])

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(ids)) } catch { /* Device-only fallback. */ }
  }, [ids])

  useEffect(() => {
    if (!supabase || !userId || !ready) return
    supabase.from('saved_wishlists').upsert({
      user_id: userId,
      product_ids: ids,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' }).then(({ error }) => {
      if (error) console.warn('Could not sync saved wishlist:', error.message)
    })
  }, [ids, userId, ready])

  const toggleWishlist = (id) => setIds((current) => current.includes(id)
    ? current.filter((item) => item !== id)
    : [...current, id])
  const isWishlisted = (id) => ids.includes(id)
  const value = useMemo(() => ({ ids, toggleWishlist, isWishlisted, count: ids.length }), [ids])
  return <WishlistContext.Provider value={value}>{children}</WishlistContext.Provider>
}

export function useWishlist() {
  const context = useContext(WishlistContext)
  if (!context) throw new Error('useWishlist must be used inside WishlistProvider')
  return context
}
