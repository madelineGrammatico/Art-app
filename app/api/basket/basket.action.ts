"use server"

import { auth } from "@/src/lib/auth/auth"
import { prisma } from "@/src/lib/prisma"

export const getBasketAction = async (userId: string) => {
  try {
    const session = await auth()
    if (!session || !session.user) throw new Error("non authorisé")
    
    // Vérifier les permissions : utilisateur peut seulement voir son propre panier sauf ADMIN
    if (session.user.role !== "ADMIN" && session.user.id !== userId) {
      throw new Error("non authorisé")
    }

    // Récupérer ou créer le panier
    let basket = await prisma.basket.findUnique({
      where: { userId },
      include: { 
        items: { 
          include: { 
            artwork: true 
          } 
        } 
      }
    })

    if (!basket) {
      basket = await prisma.basket.create({
        data: { userId },
        include: { 
          items: { 
            include: { 
              artwork: true 
            } 
          } 
        }
      })
    }

    // Nettoyer les items dont les artworks sont vendus
    const soldItems = basket.items.filter(item => item.artwork.ownerId !== null)
    let removedItemsCount = 0

    if (soldItems.length > 0) {
      await prisma.basketItem.deleteMany({
        where: {
          id: { in: soldItems.map(item => item.id) }
        }
      })
      removedItemsCount = soldItems.length
      
      // Recharger le panier après nettoyage
      basket = await prisma.basket.findUnique({
        where: { userId },
        include: { 
          items: { 
            include: { 
              artwork: true 
            } 
          } 
        }
      })
      
      // S'assurer que le panier existe toujours (ne devrait jamais être null)
      if (!basket) {
        basket = await prisma.basket.create({
          data: { userId },
          include: { 
            items: { 
              include: { 
                artwork: true 
              } 
            } 
          }
        })
      }
    }

    return { basket, removedItemsCount }
  } catch (error) {
    console.error(error)
    return { error: error instanceof Error ? error.message : "Erreur lors de la récupération du panier" }
  }
}

export const addToBasketAction = async (
  userId: string, 
  artworkId: string
) => {
  try {
    const session = await auth()
    if (!session || !session.user) throw new Error("non authorisé")
    
    // Vérifier les permissions
    if (session.user.role !== "ADMIN" && session.user.id !== userId) {
      throw new Error("non authorisé")
    }

    // Vérifier que l'artwork existe et est disponible
    const artwork = await prisma.artwork.findUnique({
      where: { id: artworkId }
    })

    if (!artwork) throw new Error("Oeuvre non trouvée")
    if (artwork.ownerId !== null) throw new Error("Cette oeuvre n'est plus disponible")

    // Récupérer ou créer le panier
    let basket = await prisma.basket.findUnique({
      where: { userId }
    })

    if (!basket) {
      basket = await prisma.basket.create({
        data: { userId }
      })
    }

    // Vérifier si l'artwork est déjà dans le panier
    const existingItem = await prisma.basketItem.findUnique({
      where: {
        basketId_artworkId: {
          basketId: basket.id,
          artworkId: artworkId
        }
      }
    })

    if (existingItem) {
      throw new Error("Cette oeuvre est déjà dans votre panier")
    }

    // Créer l'item dans le panier
    const basketItem = await prisma.basketItem.create({
      data: {
        basketId: basket.id,
        artworkId: artworkId
      },
      include: {
        artwork: true
      }
    })

    // Convertir le Decimal en nombre pour les composants clients
    const basketItemWithNumberPrice = {
      ...basketItem,
      artwork: {
        ...basketItem.artwork,
        price: Number(basketItem.artwork.price)
      }
    }

    return { basketItem: basketItemWithNumberPrice }
  } catch (error) {
    console.error(error)
    return { error: error instanceof Error ? error.message : "Erreur lors de l'ajout au panier" }
  }
}

export const removeFromBasketAction = async (
  userId: string, 
  basketItemId: string
) => {
  try {
    const session = await auth()
    if (!session || !session.user) throw new Error("non authorisé")
    
    // Vérifier les permissions
    if (session.user.role !== "ADMIN" && session.user.id !== userId) {
      throw new Error("non authorisé")
    }

    // Vérifier que l'item appartient au panier de l'utilisateur
    const basketItem = await prisma.basketItem.findUnique({
      where: { id: basketItemId },
      include: { basket: true }
    })

    if (!basketItem) throw new Error("Item non trouvé")
    if (basketItem.basket.userId !== userId) throw new Error("non authorisé")

    await prisma.basketItem.delete({
      where: { id: basketItemId }
    })

    return { success: true }
  } catch (error) {
    console.error(error)
    return { error: error instanceof Error ? error.message : "Erreur lors de la suppression de l'item" }
  }
}


export const clearBasketAction = async (userId: string) => {
  try {
    const session = await auth()
    if (!session || !session.user) throw new Error("non authorisé")
    
    // Vérifier les permissions
    if (session.user.role !== "ADMIN" && session.user.id !== userId) {
      throw new Error("non authorisé")
    }

    const basket = await prisma.basket.findUnique({
      where: { userId }
    })

    if (!basket) throw new Error("Panier non trouvé")

    await prisma.basketItem.deleteMany({
      where: { basketId: basket.id }
    })

    return { success: true }
  } catch (error) {
    console.error(error)
    return { error: error instanceof Error ? error.message : "Erreur lors du vidage du panier" }
  }
}

export const confirmBasketAction = async (userId: string) => {
  try {
    const session = await auth()
    if (!session || !session.user) throw new Error("non authorisé")
    
    // Vérifier les permissions
    if (session.user.role !== "ADMIN" && session.user.id !== userId) {
      throw new Error("non authorisé")
    }

    // Récupérer le panier avec les items et artworks
    const basket = await prisma.basket.findUnique({
      where: { userId },
      include: {
        items: {
          include: {
            artwork: true
          }
        }
      }
    })

    if (!basket) throw new Error("Panier non trouvé")
    if (basket.items.length === 0) throw new Error("Votre panier est vide")

    // Vérifier que tous les artworks sont encore disponibles
    const unavailableArtworks = basket.items.filter(item => item.artwork.ownerId !== null)
    if (unavailableArtworks.length > 0) {
      throw new Error(`${unavailableArtworks.length} oeuvre${unavailableArtworks.length > 1 ? 's' : ''} n'est plus disponible`)
    }

    // Créer une invoice pour chaque artwork du panier
    const invoices = await Promise.all(
      basket.items.map(item =>
        prisma.invoice.create({
          data: {
            artworkId: item.artworkId,
            buyerId: userId,
            amount: item.artwork.price,
            status: "PENDING"
          }
        })
      )
    )

    // Vider le panier après confirmation
    await prisma.basketItem.deleteMany({
      where: { basketId: basket.id }
    })

    return { success: true, invoicesCount: invoices.length }
  } catch (error) {
    console.error(error)
    return { error: error instanceof Error ? error.message : "Erreur lors de la confirmation du panier" }
  }
}
