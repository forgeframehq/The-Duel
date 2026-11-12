# Credits

## How the fighting works (Godot build 1.1)

The animation-first fighting (moves take their timing from the clip, the blade's own path decides hits, the planted foot
carries the body, the next move starts from a cancel point in the follow-through) follows the way these open-source Godot
projects do it. No code was copied from them; they were studied for the method.

- Snaiel, Godot4ThirdPersonCombatPrototype (MIT): damage switched on and off by the animation, "can attack again" points, parry windows. https://github.com/Snaiel/Godot4ThirdPersonCombatPrototype
- Prashanna135, Souls-Like-Controller (MIT): presses buffered during a swing and released into the next one. https://github.com/Prashanna135/Souls-Like-Controller
- Cat Prisbrey, Godot 4 Modular Souls-like Template (Unlicense): bodies moved by the animation's own steps. https://github.com/catprisbrey/Cats-Godot4-Modular-Souls-like-Template
