import { prisma } from "@/src/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function GET() {
    return NextResponse.json({
        ok:true
    })
}

export async function POST(request: NextRequest) {
    const json = await request.json()

    const newArt = await prisma.artwork.create({
        data: {
            title: json.title,
            price: json.price
        }
    })
    return NextResponse.json({
        artwork: newArt
    })
}