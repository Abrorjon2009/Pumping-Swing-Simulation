# 🪑 Pumping a Swing Physics Simulation

An interactive physics simulation proving that **a person sitting on a swing chair with feet in the air can start swinging from a complete dead stop** with zero external push and zero ground contact.

Based on the research and demonstrations of **Prof. William B. Case** (author of *"The pumping of a swing from the seated position"*, *American Journal of Physics*, 1990) and his video [*"Physics of Pumping a Swing"*](https://www.youtube.com/watch?v=MbWhKFIayp4).

---

## 🔬 The Physics: Driven Harmonic Oscillator vs. Parametric Resonance

Many physics textbooks claim that a playground swing is a *parametric oscillator* driven at $2\omega_0$ (standing up and squatting twice per cycle). However, as proved by Case & Swanson (1990):

> **A seated swinger operates as a RESONANTLY DRIVEN OSCILLATOR at the fundamental frequency $\omega_0$.**

### Equation of Motion (Case & Swanson, 1990)

$$I_{\text{total}} \ddot{\theta} + b \dot{\theta} + M g L \sin\theta = D(t)$$

Where the **Driving Torque** $D(t)$ consists of two distinct physical mechanisms:

$$D(t) = \underbrace{- I_{\text{body}} \ddot{\phi}(t)}_{\text{Inertial Reaction Torque}} \quad \underbrace{- m_{\text{body}} g d \sin(\theta + \phi(t))}_{\text{Gravitational Tilt Torque}}$$

- $\theta$: Swing angle from vertical
- $\phi$: Angle of body tilt relative to the suspension ropes
- $I_{\text{body}}$: Moment of inertia of rider rotating about the seat
- $d$: Distance from seat to the rider's center of mass (COM)

### Proving Motion from a Dead Stop ($\theta = 0, \dot{\theta} = 0$)

When hanging stationary:
$$D(0) = - I_{\text{body}} \ddot{\phi}(0) - m_{\text{body}} g d \sin\phi(0) \neq 0$$

As soon as the rider activates core muscles to tilt their body ($\phi \neq 0$ or $\ddot{\phi} \neq 0$), a non-zero driving torque is generated immediately:

$$\ddot{\theta}(0) = \frac{D(0)}{I_{\text{total}}} \neq 0$$

**The swing must accelerate into motion without any ground contact!**

---

## ⚡ Features

- **Seated Swing Chair**: Realistic wooden swing seat suspended by chains with an articulated rider.
- **Airborne Sensor**: Live ground clearance ruler confirming zero foot contact.
- **Real-Time Oscilloscope**: Dual-trace display plotting swing position $\theta(t)$ and driving torque $D(t)$ in resonance.
- **Live Telemetry HUD**: Displays swing angle, body tilt, instantaneous torque ($N\cdot m$), power delivered ($W$), and ground clearance ($cm$).
- **Dual Theory Selector**:
  - *Driven Oscillator ($\omega_0$)* — Case's Seated Model.
  - *Parametric Oscillator ($2\omega_0$)* — Standing Squat Model.
- **Manual Mode**: Test starting from rest yourself with `←` / `→` arrow keys or buttons!

---

## 🚀 Running Locally

Open `index.html` in any modern web browser or serve it locally:

```bash
npx serve .
```

---

## 📚 References

1. **William B. Case & Mark A. Swanson**, *"The pumping of a swing from the seated position"*, *American Journal of Physics* 58, 463–467 (1990).
2. **William B. Case**, *"The pumping of a swing from the standing position"*, *American Journal of Physics* 64, 215–224 (1996).
3. **William B. Case**, *"Physics of Pumping a Swing"*, [YouTube](https://www.youtube.com/watch?v=MbWhKFIayp4).
