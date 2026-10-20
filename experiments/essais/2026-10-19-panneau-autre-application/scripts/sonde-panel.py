"""Sonde : le panneau de T268 tel quel, sans la seule garde d'application YouTube. Rien n'est modifié sur la TV."""
import sys
sys.path.insert(0, '/media/developer/tvlens-remote/runtime')
import panel

checked = panel.rectangles

def any_application(video):
    return checked(dict(video, appId='youtube.leanback.v4'))

panel.rectangles = any_application
panel.main()
