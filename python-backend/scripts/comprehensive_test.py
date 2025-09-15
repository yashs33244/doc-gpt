#!/usr/bin/env python3
"""
Comprehensive Test Suite for Doctor GPT Backend
This script sets up test users and runs comprehensive API tests
"""

import asyncio
import sys
from pathlib import Path

# Add project root to path
sys.path.append(str(Path(__file__).parent.parent))

import structlog
from create_test_user import TestUserManager
from test_apis import APITester

logger = structlog.get_logger(__name__)


async def run_comprehensive_tests(base_url: str = "http://localhost:8000", setup_user: bool = True):
    """Run comprehensive test suite"""
    
    logger.info("🚀 Starting comprehensive Doctor GPT test suite...")
    logger.info(f"📋 Base URL: {base_url}")
    logger.info("=" * 70)
    
    success = True
    
    try:
        # Step 1: Set up test user if requested
        if setup_user:
            logger.info("🔄 Setting up test environment...")
            test_manager = TestUserManager()
            
            try:
                setup_result = await test_manager.setup_complete_test_environment()
                logger.info("✅ Test environment setup completed")
                logger.info(f"   - User ID: {setup_result['test_credentials']['user_id']}")
                logger.info(f"   - Session ID: {setup_result['test_credentials']['session_id']}")
                logger.info(f"   - Database records: {setup_result['database_stats']}")
            except Exception as e:
                logger.error("❌ Test environment setup failed", error=str(e))
                return False
            
            logger.info("")
        
        # Step 2: Run API tests
        logger.info("🔄 Running comprehensive API tests...")
        
        tester = APITester(base_url)
        test_success = await tester.run_all_tests()
        
        if not test_success:
            success = False
            logger.error("❌ API tests failed")
        else:
            logger.info("✅ API tests completed successfully")
            
        return success
        
    except Exception as e:
        logger.error("💥 Comprehensive test suite failed", error=str(e))
        return False


async def main():
    """Main function"""
    import argparse
    
    parser = argparse.ArgumentParser(description="Comprehensive test suite for Doctor GPT")
    parser.add_argument("--url", default="http://localhost:8000", 
                       help="Base URL for API testing")
    parser.add_argument("--no-setup", action="store_true", 
                       help="Skip test user setup")
    parser.add_argument("--verbose", "-v", action="store_true", 
                       help="Verbose output")
    
    args = parser.parse_args()
    
    if args.verbose:
        import logging
        logging.basicConfig(level=logging.DEBUG)
    
    try:
        success = await run_comprehensive_tests(
            base_url=args.url, 
            setup_user=not args.no_setup
        )
        
        print(f"\n{'='*70}")
        if success:
            print("🎉 COMPREHENSIVE TEST SUITE: ALL TESTS PASSED")
            print("✅ Your Doctor GPT backend is ready for production!")
        else:
            print("❌ COMPREHENSIVE TEST SUITE: SOME TESTS FAILED")
            print("⚠️  Please review the errors above and fix issues before proceeding.")
        print(f"{'='*70}")
        
        if not success:
            sys.exit(1)
            
    except KeyboardInterrupt:
        logger.info("Test suite interrupted by user")
        sys.exit(1)
    except Exception as e:
        logger.error("Test suite execution failed", error=str(e))
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())

