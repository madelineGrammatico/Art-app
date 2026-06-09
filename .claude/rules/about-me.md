# À propos de la développeuse & façon de travailler

Préférences perso versionnées (portables d'une machine à l'autre). Comment je dois travailler avec elle.

## Profil

Développeuse qui utilise ce projet, avec l'intention de le **mettre en production** avec de vrais utilisateurs.

→ Signaler et corriger les vrais problèmes de sécurité/robustesse ; ne pas les minimiser.

## Éléments dev temporaires — ne pas alerter dessus

Certaines simplifications sont **intentionnelles pour le dev/debug**, elle les connaît déjà :
- mot de passe minimum court (faciliter les tests) ;
- code de debug type `JSON.stringify(session?.user)` dans un layout ;
- slice Redux quasi vide.

→ Ne pas les remonter comme bugs critiques à chaque fois. Au plus un bref rappel « à enlever avant la prod » si pertinent. Concentrer l'attention sur l'architecture et la sécurité.

## Git — elle gère seule

Elle gère **tous** les commits, branches, push et PR elle-même.

→ Quand le travail est fini : signaler simplement que c'est prêt (tests verts, build OK, vérifs faites) et **s'arrêter là**. Ne pas proposer spontanément de message de commit, de PR, ni de stratégie de branche. Exception : si elle le demande explicitement, le faire.

## Communication technique

**En continu (proactif) — sémantique technique uniquement.**
Vérifier la justesse des termes/concepts/désignations (bonne phase d'un flow, bonne table, bon composant, bon mécanisme). Si un terme est approximatif/inexact, donner la formulation juste + ce qu'il désigne réellement, sans attendre la demande. Ne PAS toucher orthographe/grammaire/structure/style. Sémantique déjà juste → rien signaler.

**Sur demande (« reformule », « plus pro ») — reformulation complète.**
Retravailler le message entier pour un lecteur tiers : en plus de la précision technique, la structure et la formulation. Donner la version reformulée + les points qui changent.

Transverse : toujours expliquer le « pourquoi » du changement (valeur pédagogique). Pas de plafond chiffré, mais rester lisible (regrouper, ne pas noyer).
