import Nav from './components/Nav'
import Hero from './components/Hero'
import Formats from './components/Formats'
import SplitSection from './components/SplitSection'
import Features from './components/Features'
import Start from './components/Start'
import Footer from './components/Footer'

export default function App() {
  return (
    <div className="relative min-h-screen overflow-x-clip">
      <div aria-hidden="true" className="grain" />
      <Nav />
      <main>
        <Hero />
        <Formats />
        <SplitSection />
        <Features />
        <Start />
      </main>
      <Footer />
    </div>
  )
}
