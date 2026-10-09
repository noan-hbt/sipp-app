import { useQueryClient } from '@tanstack/react-query'
import { AnimatePresence } from 'motion/react'
import { lazy, Suspense, useEffect, useSyncExternalStore } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { TabBar } from './components/TabBar'
import { Api, getTokens, onTokens } from './lib/api'
import { play } from './lib/sound'
import { Auth } from './screens/Auth'
import { Generating } from './screens/Generating'
import { Home } from './screens/Home'
import { Library } from './screens/Library'
import { NewSip, WISH_KEY } from './screens/NewSip'
import { Offers } from './screens/Offers'
import { BillingReturn } from './screens/BillingReturn'
import { Profile } from './screens/Profile'
import { ProgramView } from './screens/ProgramView'
import { Progress } from './screens/Progress'
import { SipMap } from './screens/SipMap'
import { Understood } from './screens/Understood'
import { Welcome } from './screens/Welcome'
import { track } from './lib/telemetry'

// The lesson player carries the block renderers and code highlighting: loaded on first use.
const Lesson = lazy(() => import('./screens/Lesson').then((m) => ({ default: m.Lesson })))
const LessonDone = lazy(() => import('./screens/LessonDone').then((m) => ({ default: m.LessonDone })))
const Review = lazy(() => import('./screens/Review').then((m) => ({ default: m.Review })))
const ModuleQuiz = lazy(() => import('./screens/ModuleQuiz').then((m) => ({ default: m.ModuleQuiz })))
const Demo = lazy(() => import('./screens/Demo').then((m) => ({ default: m.Demo })))
const BlockGallery = lazy(() => import('./screens/BlockGallery').then((m) => ({ default: m.BlockGallery })))

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
        track('sip_requested', { source: 'onboarding', lite: sip.lite })
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
        <Suspense key={location.pathname} fallback={null}>
        <Routes location={location}>
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
              <Route path="/billing/return" element={<BillingReturn />} />
              {import.meta.env.DEV && <Route path="/dev/blocks" element={<BlockGallery />} />}
              <Route path="/sips/:sipId/building" element={<Generating />} />
              <Route path="/sips/:sipId" element={<SipMap />} />
              <Route path="/programs/:programId" element={<ProgramView />} />
              <Route path="/lessons/:lessonId" element={<Lesson />} />
              <Route path="/lessons/:lessonId/done" element={<LessonDone />} />
              <Route path="/modules/:moduleId/quiz" element={<ModuleQuiz />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </>
          )}
        </Routes>
        </Suspense>
      </AnimatePresence>
      {loggedIn && <TabBar />}
    </div>
  )
}
