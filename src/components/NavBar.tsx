"use client"

import React from 'react'
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
import { SignOut } from "@/src/components/Sign-out";
import Link from "next/link";

export default function NavBar() {
    const { data: session }= useSession()
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
            <MenubarTrigger>{session?.user?.firstName || session?.user?.name?.split(" ")[0]}</MenubarTrigger>
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
                  <SignOut/>
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
