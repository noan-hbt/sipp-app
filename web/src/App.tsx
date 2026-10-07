import { AnimatePresence } from 'motion/react'
import { useSyncExternalStore } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { getTokens, onTokens } from './lib/api'
import { Auth } from './screens/Auth'
import { Generating } from './screens/Generating'
import { Home } from './screens/Home'
import { Lesson } from './screens/Lesson'
import { LessonDone } from './screens/LessonDone'
import { NewSip } from './screens/NewSip'
import { SipMap } from './screens/SipMap'

function useLoggedIn() {
  return useSyncExternalStore(onTokens, () => getTokens() !== null)
}

export default function App() {
  const location = useLocation()
  const loggedIn = useLoggedIn()
  return (
    <div className="app">
      <AnimatePresence mode="popLayout" initial={false}>
        <Routes location={location} key={location.pathname}>
          {!loggedIn ? (
            <Route path="*" element={<Auth />} />
          ) : (
            <>
              <Route path="/" element={<Home />} />
              <Route path="/new" element={<NewSip />} />
              <Route path="/sips/:sipId/building" element={<Generating />} />
              <Route path="/sips/:sipId" element={<SipMap />} />
              <Route path="/lessons/:lessonId" element={<Lesson />} />
              <Route path="/lessons/:lessonId/done" element={<LessonDone />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </>
          )}
        </Routes>
      </AnimatePresence>
    </div>
  )
}
