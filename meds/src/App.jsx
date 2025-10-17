import { useState } from 'react'

import reactLogo from './assets/react.svg'
import viteLogo from '/vite.svg'
import './App.css'
import './Pages/sign-in/SignIn'
import SignIn from './Pages/sign-in/SignIn'
import './Pages/dashboard/Dashboard'
import Dashboard from './Pages/dashboard/Dashboard'
import { Routes, Route } from 'react-router';

function App() {
  const [count, setCount] = useState(0)

  return (
    <>
      <Routes>
        <Route path="/" element={<SignIn />} />
        <Route path="/dashboard" element={<Dashboard />} />
        
      </Routes>
    </>
  )
}

export default App
