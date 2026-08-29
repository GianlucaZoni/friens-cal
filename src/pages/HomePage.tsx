import { NavBar } from '@/components/nav-bar'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export const HomePage = () => {
  return (
    <section className="flex flex-col items-center justify-center min-h-screen relative">
      <NavBar className="absolute top-0 left-0 right-0" />

      <div className="flex flex-1 items-center justify-center w-full px-4">
        <Card className="w-full max-w-2xl">
          <CardHeader>
            <CardTitle className="text-xl font-semibold">Vibe Template</CardTitle>
            <CardDescription className="text-lg font-medium">
              An Agentic friendly template to kickstart your next project
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            <p>
              This template provides a solid foundation for building React applications with a
              curated stack of modern tools and a clean design system.
            </p>
          </CardContent>
        </Card>
      </div>
    </section>
  )
}
