import { NextRequest, NextResponse } from "next/server";

export async function GET() {
    return NextResponse.json({
        ok:true
    })
}

export async function POST(request: NextRequest) {
    const formData = await request.formData()
    console.log(formData)

    const data = {
        title: formData.get("title"),
        price: formData.get("price"),
    }
    
    return NextResponse.json({
        json: data
    })
}