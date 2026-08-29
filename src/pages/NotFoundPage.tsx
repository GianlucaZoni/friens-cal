import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Link } from 'react-router'

function NotFoundPage() {
  return (
    <div className="flex flex-col items-center justify-center h-screen">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>404</CardTitle>
          <CardDescription>Page not found</CardDescription>
        </CardHeader>

        <CardFooter>
          <Button>
            <Link to="/">Go to home</Link>
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}

export { NotFoundPage }
