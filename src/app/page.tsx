"use client"

import { useState, useEffect } from "react"
import AuthView from "@/components/AuthView"
import DashboardView from "@/components/DashboardView"

export default function Home() {
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null)
  const [user, setUser] = useState<{ email: string; name: string } | null>(null)

  useEffect(() => {
    const stored = localStorage.getItem("sze_user")
    if (stored) {
      setUser(JSON.parse(stored))
      setIsLoggedIn(true)
    } else {
      setIsLoggedIn(false)
    }
  }, [])

  const handleAuthSuccess = (userData: { email: string; name: string }) => {
    localStorage.setItem("sze_user", JSON.stringify(userData))
    setUser(userData)
    setIsLoggedIn(true)
  }

  const handleLogout = () => {
    localStorage.removeItem("sze_user")
    setUser(null)
    setIsLoggedIn(false)
  }

  if (isLoggedIn === null) {
    return <div className="h-screen w-full bg-[#fcfcfc]" />
  }

  return isLoggedIn && user ? (
    <DashboardView onLogout={handleLogout} user={user} />
  ) : (
    <AuthView onAuthSuccess={handleAuthSuccess} />
  )
}