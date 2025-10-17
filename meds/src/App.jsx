import { useState } from 'react'

import reactLogo from './assets/react.svg'
import viteLogo from '/vite.svg'
import './App.css'
import './sign-in/SignIn'
import SignIn from './sign-in/SignIn'
import { Routes, Route } from 'react-router';

function App() {
  const [count, setCount] = useState(0)

  return (
    <>
      <Routes>
        <Route path="/" element={<SignIn />} />
        
      </Routes>
    </>
  )
}

export default App
