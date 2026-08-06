import { Routes, Route } from 'react-router'
import Layout from '@/components/Layout'
import Home from '@/pages/Home'
import Sessions from '@/pages/Sessions'
import Truth from '@/pages/Truth'
import Methodology from '@/pages/Methodology'

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="sessions" element={<Sessions />} />
        <Route path="truth" element={<Truth />} />
        <Route path="methodology" element={<Methodology />} />
      </Route>
    </Routes>
  )
}
