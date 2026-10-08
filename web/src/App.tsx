import { useQueryClient } from '@tanstack/react-query'
import { AnimatePresence } from 'motion/react'
import { useEffect, useSyncExternalStore } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { TabBar } from './components/TabBar'
import { Api, getTokens, onTokens } from './lib/api'
import { play } from './lib/sound'
import { Auth } from './screens/Auth'
import { Demo } from './screens/Demo'
import { Generating } from './screens/Generating'
import { Home } from './screens/Home'
import { Lesson } from './screens/Lesson'
import { LessonDone } from './screens/LessonDone'
import { Library } from './screens/Library'
import { NewSip, WISH_KEY } from './screens/NewSip'
import { Offers } from './screens/Offers'
import { Profile } from './screens/Profile'
import { ProgramView } from './screens/ProgramView'
import { Progress } from './screens/Progress'
import { Review } from './screens/Review'
import { SipMap } from './screens/SipMap'
import { Understood } from './screens/Understood'
import { Welcome } from './screens/Welcome'

function useLoggedIn() {
  return useSyncExternalStore(onTokens, () => getTokens() !== null)
}

/** After sign-up from the onboarding, build the Sip the visitor asked for. */
function usePendingWish(loggedIn: boolean) {
  const nav = useNavigate()
  const qc = useQueryClient()
  useEffect(() => {
    if (!loggedIn) return
    let wish: string | null = null
    try {
      wish = sessionStorage.getItem(WISH_KEY)
      sessionStorage.removeItem(WISH_KEY)
    } catch {
      return
    }
    if (!wish) return
    Api.createSip(wish)
      .then((sip) => {
        play('whoosh')
        void qc.invalidateQueries({ queryKey: ['sips'] })
        nav(`/sips/${sip.id}/building`)
      })
      .catch(() => {
        try {
          sessionStorage.setItem(WISH_KEY, wish!)
        } catch {
          /* ignore */
        }
        nav('/new')
      })
  }, [loggedIn, nav, qc])
}

export default function App() {
  const location = useLocation()
  const loggedIn = useLoggedIn()
  usePendingWish(loggedIn)
  return (
    <div className="app">
      <AnimatePresence mode="popLayout" initial={false}>
        <Routes location={location} key={location.pathname}>
          {!loggedIn ? (
            <>
              <Route path="/" element={<Welcome />} />
              <Route path="/start" element={<NewSip guest />} />
              <Route path="/demo" element={<Demo />} />
              <Route path="/signup" element={<Auth initial="register" />} />
              <Route path="/login" element={<Auth initial="login" />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </>
          ) : (
            <>
              <Route path="/" element={<Home />} />
              <Route path="/library" element={<Library />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/new" element={<NewSip />} />
              <Route path="/new/confirm" element={<Understood />} />
              <Route path="/review" element={<Review />} />
              <Route path="/progress" element={<Progress />} />
              <Route path="/offers" element={<Offers />} />
              <Route path="/sips/:sipId/building" element={<Generating />} />
              <Route path="/sips/:sipId" element={<SipMap />} />
              <Route path="/programs/:programId" element={<ProgramView />} />
              <Route path="/lessons/:lessonId" element={<Lesson />} />
              <Route path="/lessons/:lessonId/done" element={<LessonDone />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </>
          )}
        </Routes>
      </AnimatePresence>
      {loggedIn && <TabBar />}
    </div>
  )
}
