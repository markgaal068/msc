"use client"

import { useState, useEffect } from "react"
import AuthView from "@/components/AuthView"
import DashboardView from "@/components/DashboardView"

export default function Home() {
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null)

  // Ellenőrizzük a korábbi belépést az oldal betöltésekor
  useEffect(() => {
    const user = localStorage.getItem("sze_user")
    setIsLoggedIn(!!user)
  }, [])

  const handleAuthSuccess = (user: { email: string; name: string }) => {
    localStorage.setItem("sze_user", JSON.stringify(user))
    setIsLoggedIn(true)
  }

  const handleLogout = () => {
    localStorage.removeItem("sze_user")
    setIsLoggedIn(false)
  }

  // Megakadályozza a felvillanást, amíg a localStorage tölt
  if (isLoggedIn === null) {
    return <div className="h-screen w-full bg-[#fcfcfc]" />
  }

  return isLoggedIn ? (
    <DashboardView onLogout={handleLogout} />
  ) : (
    <AuthView onAuthSuccess={handleAuthSuccess} />
  )
}