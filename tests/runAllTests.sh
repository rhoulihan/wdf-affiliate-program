#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}Starting Laundromat Affiliate Program Test Suite${NC}"
echo "================================================"

# Set test environment
export NODE_ENV=test
export JWT_SECRET=test-secret-key
export MONGODB_URI=mongodb://localhost:27017/wavemax-test

# Run linting first
echo -e "\n${YELLOW}Running ESLint...${NC}"
npm run lint
LINT_EXIT=$?

if [ $LINT_EXIT -ne 0 ]; then
    echo -e "${RED}Linting failed! Please fix linting errors before running tests.${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Linting passed${NC}"

# Run unit tests
echo -e "\n${YELLOW}Running Unit Tests...${NC}"
npm test -- tests/unit --coverage

# Run integration tests
echo -e "\n${YELLOW}Running Integration Tests...${NC}"
npm test -- tests/integration

# Run all tests with coverage report
echo -e "\n${YELLOW}Running All Tests with Coverage Report...${NC}"
npm test -- --coverage

# Generate coverage report
echo -e "\n${YELLOW}Generating Coverage Report...${NC}"
npm test -- --coverage --coverageReporters=html

echo -e "\n${GREEN}Test suite completed!${NC}"
echo -e "Coverage report generated in: ./coverage/lcov-report/index.html"

# Check if all tests passed
TEST_EXIT=$?
if [ $TEST_EXIT -eq 0 ]; then
    echo -e "\n${GREEN}✓ All tests passed!${NC}"
else
    echo -e "\n${RED}✗ Some tests failed. Please check the output above.${NC}"
    exit 1
fi