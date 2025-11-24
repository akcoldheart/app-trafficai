import Link from 'next/link';

export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="footer footer-transparent d-print-none">
      <div className="container-xl">
        <div className="row text-center align-items-center flex-row-reverse">
          <div className="col-lg-auto ms-lg-auto">
            <ul className="list-inline list-inline-dots mb-0">
              <li className="list-inline-item">
                <Link href="/settings" className="link-secondary">
                  Settings
                </Link>
              </li>
            </ul>
          </div>
          <div className="col-12 col-lg-auto mt-3 mt-lg-0">
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
