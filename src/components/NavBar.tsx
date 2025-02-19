"use client"

import React, { useEffect, useState } from 'react'
import { useSession } from "next-auth/react";

import {
  Menubar,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarSeparator,
  // MenubarShortcut,
  // MenubarPortal,
  MenubarTrigger,
} from "@/src/components/ui/menubar"
import { SignOutButton } from "@/src/components/SignOutButton";
import Link from "next/link";

export default function NavBar() {
  const { 
      data: session, 
      status,
    } = useSession();

  if (status === "loading") {
    return (
      <nav className="flex flex-row py-4 gap-4 items-center">
        <div className="flex-1 text-white text-2xl font-bold">Madeline Grammatico</div>
        <div className="flex">Chargement...</div>
      </nav>
    );
  }

  return (
    <nav className="flex flex-row py-4 gap-4 items-center color">
      <Link className="flex-1 text-white text-2xl font-bold" href="/">Madeline Grammatico</Link>
      
      <Menubar className="flex rounded-md bg-transparent p-[3px] text-white w-auto">
        <MenubarMenu>
          <MenubarTrigger>Galerie</MenubarTrigger>
          <MenubarContent className="bg-slate-400 text-white">
            <MenubarItem>
            <Link href="/">
                  Arts
              </Link>
            </MenubarItem>
          </MenubarContent>
        </MenubarMenu>

        <MenubarMenu>
          <MenubarTrigger>Admin</MenubarTrigger>
          <MenubarContent className="bg-slate-400 text-white">
          <MenubarItem>
            <Link href="/admin">
              Arts
            </Link>
          </MenubarItem>
          <MenubarItem>
            <Link href="/admin/arts/new">
              New Art
            </Link>
          </MenubarItem>
          </MenubarContent>
        </MenubarMenu>

        { session ? 
          <MenubarMenu>
            <MenubarTrigger>{session?.user?.firstName || "session"}</MenubarTrigger>
            <MenubarContent className="bg-slate-400 text-white">
              <MenubarItem>
                <Link href="">
                  Ma Collection
                </Link>
              </MenubarItem>
              <MenubarItem>
                <Link href="">
                  Mon Panier
                </Link>
              </MenubarItem>
              <MenubarItem>
                <Link href="">
                  Mon Profil
                </Link>
              </MenubarItem>
              <MenubarSeparator/>
                <MenubarItem>
                  <SignOutButton/>
                </MenubarItem>
            </MenubarContent>
          </MenubarMenu>
        :
          <MenubarMenu>
            <MenubarTrigger>Sign</MenubarTrigger>
            <MenubarContent className="bg-slate-400 text-white max-w-sm mx-auto">
              <MenubarItem>
                <Link href="/sign-in">
                  Sign In
                </Link>
              </MenubarItem>
              <MenubarItem>
                <Link href="/sign-up">
                  Sign Up
                </Link>
              </MenubarItem>
            </MenubarContent>
          </MenubarMenu>
        }
      </Menubar>
    </nav>
  )
}
