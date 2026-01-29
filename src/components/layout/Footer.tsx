import Link from 'next/link';

export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="footer footer-transparent d-print-none" style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 100 }}>
      <div className="container-xl">
        <div className="row text-center align-items-center">
          <div className="col-12">
            <ul className="list-inline list-inline-dots mb-0">
              <li className="list-inline-item">
                Copyright &copy; {currentYear}{' '}
                <Link href="/" className="link-secondary">
                  Traffic AI
                </Link>
                . All rights reserved.
              </li>
            </ul>
          </div>
        </div>
      </div>
    </footer>
  );
}
