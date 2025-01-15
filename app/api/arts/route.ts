import { prisma } from "@/src/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function GET() {
    return NextResponse.json({
        ok:true
    })
}

export async function POST(request: NextRequest) {
    const formData = await request.formData()

    const newArt = await prisma.art.create({
        data: {
            title: String(formData.get("title")),
            price: String(formData.get("price"))
        }
    })
    return NextResponse.json({
        art: newArt
    })
}